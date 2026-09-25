const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   DATABASE CONNECTION
   ========================================================= */

const hasDatabase = !!process.env.DATABASE_URL;

const pool = hasDatabase
    ? new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: {
              rejectUnauthorized: false
          }
      })
    : null;


/* =========================================================
   EXPRESS SETUP
   ========================================================= */

app.use(express.json({ limit: "5mb" }));

const publicFolder = path.join(__dirname, "public");

const ordersFile = path.join(__dirname, "orders.json");
const customersFile = path.join(__dirname, "customers.json");

app.use(express.static(publicFolder));


/* =========================================================
   JSON FILE FUNCTIONS
   ========================================================= */

function readJSON(file) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, "[]");
        }

        const content = fs.readFileSync(file, "utf8");

        if (!content.trim()) {
            return [];
        }

        return JSON.parse(content);

    } catch (error) {
        console.error("JSON read error:", error);
        return [];
    }
}


function writeJSON(file, data) {
    try {
        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error("JSON write error:", error);
    }
}


/* =========================================================
   POSTGRESQL DATABASE INITIALIZATION
   ========================================================= */

async function initializeDatabase() {

    if (!hasDatabase) {
        console.log(
            "DATABASE_URL not found. Running without PostgreSQL."
        );
        return;
    }

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name TEXT,
                phone TEXT,
                lang TEXT DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER,
                order_id TEXT,
                order_details JSONB,
                total_amount NUMERIC DEFAULT 0,
                payment_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);


        console.log(
            "PostgreSQL database initialized successfully"
        );

    } catch (error) {

        console.error(
            "Database initialization error:",
            error
        );
    }
}


/* =========================================================
   CUSTOMER API
   ========================================================= */

app.post("/api/customer", async (req, res) => {

    try {

        const name = req.body.name || "";
        const phone = req.body.phone || "";
        const lang = req.body.lang || "en";


        /* ---------------------------------------------
           PostgreSQL
           --------------------------------------------- */

        if (hasDatabase) {

            const result = await pool.query(
                `
                INSERT INTO customers
                (name, phone, lang)

                VALUES
                ($1, $2, $3)

                RETURNING id
                `,
                [
                    name,
                    phone,
                    lang
                ]
            );


            const customerId = result.rows[0].id;


            /* Local JSON backup */

            try {

                const customers =
                    readJSON(customersFile);

                customers.push({
                    id: customerId,
                    name: name,
                    phone: phone,
                    lang: lang,
                    created_at:
                        new Date().toISOString()
                });

                writeJSON(
                    customersFile,
                    customers
                );

            } catch (jsonError) {

                console.error(
                    "Customer JSON backup error:",
                    jsonError
                );
            }


            return res.json({
                success: true,
                customer_id: customerId
            });
        }


        /* ---------------------------------------------
           Local fallback if PostgreSQL isn't available
           --------------------------------------------- */

        const customers =
            readJSON(customersFile);

        const customer = {

            id: customers.length + 1,

            name: name,

            phone: phone,

            lang: lang,

            created_at:
                new Date().toISOString()
        };


        customers.push(customer);

        writeJSON(
            customersFile,
            customers
        );


        res.json({

            success: true,

            customer_id:
                customer.id
        });


    } catch (error) {

        console.error(
            "Customer save error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Could not save customer"
        });
    }
});


/* =========================================================
   ORDER API
   ========================================================= */

app.post("/api/order", async (req, res) => {

    try {

        const customerId =
            req.body.customer_id || 0;

        const orderId =
            req.body.order_id || "";

        const orderDetails =
            req.body.order_details || [];

        const totalAmount =
            req.body.total_amount || 0;

        const paymentMethod =
            req.body.payment_method || "";


        /* ---------------------------------------------
           PostgreSQL
           --------------------------------------------- */

        if (hasDatabase) {

            await pool.query(
                `
                INSERT INTO orders
                (
                    customer_id,
                    order_id,
                    order_details,
                    total_amount,
                    payment_method
                )

                VALUES
                ($1, $2, $3, $4, $5)
                `,
                [
                    customerId,
                    orderId,
                    orderDetails,
                    totalAmount,
                    paymentMethod
                ]
            );


            /* Local JSON backup */

            try {

                const orders =
                    readJSON(ordersFile);

                orders.push({

                    customer_id:
                        customerId,

                    order_id:
                        orderId,

                    order_details:
                        orderDetails,

                    total_amount:
                        totalAmount,

                    payment_method:
                        paymentMethod,

                    created_at:
                        new Date().toISOString()
                });


                writeJSON(
                    ordersFile,
                    orders
                );

            } catch (jsonError) {

                console.error(
                    "Order JSON backup error:",
                    jsonError
                );
            }


            return res.json({

                success: true,

                message:
                    "Order saved successfully",

                order_id:
                    orderId
            });
        }


        /* ---------------------------------------------
           Local fallback if PostgreSQL isn't available
           --------------------------------------------- */

        const orders =
            readJSON(ordersFile);


        const order = {

            customer_id:
                customerId,

            order_id:
                orderId,

            order_details:
                orderDetails,

            total_amount:
                totalAmount,

            payment_method:
                paymentMethod,

            created_at:
                new Date().toISOString()
        };


        orders.push(order);

        writeJSON(
            ordersFile,
            orders
        );


        res.json({

            success: true,

            message:
                "Order saved successfully",

            order_id:
                orderId
        });


    } catch (error) {

        console.error(
            "Order save error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Could not save order"
        });
    }
});


/* =========================================================
   GET ORDERS
   Useful for dashboard/testing
   ========================================================= */

app.get("/api/orders", async (req, res) => {

    try {

        if (hasDatabase) {

            const result =
                await pool.query(`
                    SELECT *
                    FROM orders
                    ORDER BY created_at DESC
                `);

            return res.json({
                success: true,
                orders: result.rows
            });
        }


        const orders =
            readJSON(ordersFile);


        res.json({

            success: true,

            orders:
                orders.reverse()
        });


    } catch (error) {

        console.error(
            "Get orders error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Could not get orders"
        });
    }
});


/* =========================================================
   GET CUSTOMERS
   Useful for dashboard/testing
   ========================================================= */

app.get("/api/customers", async (req, res) => {

    try {

        if (hasDatabase) {

            const result =
                await pool.query(`
                    SELECT *
                    FROM customers
                    ORDER BY created_at DESC
                `);

            return res.json({

                success: true,

                customers:
                    result.rows
            });
        }


        const customers =
            readJSON(customersFile);


        res.json({

            success: true,

            customers:
                customers.reverse()
        });


    } catch (error) {

        console.error(
            "Get customers error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Could not get customers"
        });
    }
});


/* =========================================================
   LIVE SERVER STATISTICS
   ========================================================= */

app.get("/api/stats", (req, res) => {

    try {

        const cpus = os.cpus();

        let idle = 0;

        let total = 0;


        cpus.forEach(cpu => {

            idle += cpu.times.idle;

            total +=
                cpu.times.user +
                cpu.times.nice +
                cpu.times.sys +
                cpu.times.irq +
                cpu.times.idle;
        });


        const cpuUsage =
            ((1 - idle / total) * 100)
            .toFixed(1);


        const totalMemory =
            os.totalmem();

        const freeMemory =
            os.freemem();

        const usedMemory =
            totalMemory - freeMemory;


        let disk = null;


        try {

            const stat =
                fs.statfsSync("/");

            const totalDisk =
                stat.blocks * stat.bsize;

            const freeDisk =
                stat.bfree * stat.bsize;


            disk = {

                total:
                    totalDisk,

                free:
                    freeDisk,

                usedPercent:
                    (
                        (
                            (totalDisk - freeDisk)
                            / totalDisk
                        ) * 100
                    ).toFixed(1)
            };

        } catch (error) {

            disk = {

                usedPercent:
                    "N/A"
            };
        }


        res.json({

            cpu:
                cpuUsage,

            memory:
                (
                    (usedMemory / totalMemory)
                    * 100
                ).toFixed(1),

            disk:
                disk.usedPercent,

            hostname:
                os.hostname(),

            platform:
                os.platform(),

            uptime:
                os.uptime()
        });


    } catch (error) {

        console.error(
            "Stats error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Could not get server statistics"
        });
    }
});


/* =========================================================
   DASHBOARD
   ========================================================= */

app.get("/dashboard.html", (req, res) => {

    res.sendFile(
        path.join(
            publicFolder,
            "dashboard.html"
        )
    );
});


/* =========================================================
   START SERVER
   ========================================================= */

async function startServer() {

    await initializeDatabase();


    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                `The Rustic Brew server running on port ${PORT}`
            );
        }
    );
}


startServer();
