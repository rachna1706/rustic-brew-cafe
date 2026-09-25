const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

const publicFolder = path.join(__dirname, "public");

/* =========================
   POSTGRESQL CONNECTION
========================= */

let pool = null;

if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    pool.on("error", (err) => {
        console.error("PostgreSQL error:", err);
    });
}

/* =========================
   STATIC WEBSITE
========================= */

app.use(express.static(publicFolder));

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initializeDatabase() {
    if (!pool) {
        console.log("DATABASE_URL not found. Database not connected.");
        return;
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                lang TEXT DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                customer_id INTEGER,
                order_id TEXT NOT NULL,
                order_details JSONB,
                total_amount NUMERIC(10,2) DEFAULT 0,
                payment_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("PostgreSQL connected successfully.");
        console.log("Customers and Orders tables are ready.");

    } catch (error) {
        console.error("Database initialization failed:", error);
    }
}

/* =========================
   CUSTOMER API
========================= */

app.post("/api/customer", async (req, res) => {
    try {

        if (!pool) {
            return res.status(500).json({
                success: false,
                message: "Database is not connected"
            });
        }

        const name = req.body.name || "";
        const phone = req.body.phone || "";
        const lang = req.body.lang || "en";

        const result = await pool.query(
            `
            INSERT INTO customers (name, phone, lang)
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [name, phone, lang]
        );

        res.json({
            success: true,
            customer_id: result.rows[0].id
        });

    } catch (error) {

        console.error("Customer error:", error);

        res.status(500).json({
            success: false,
            message: "Could not save customer"
        });
    }
});

/* =========================
   ORDER API
========================= */

app.post("/api/order", async (req, res) => {
    try {

        if (!pool) {
            return res.status(500).json({
                success: false,
                message: "Database is not connected"
            });
        }

        const customerId = req.body.customer_id || null;
        const orderId = req.body.order_id || "";
        const orderDetails = req.body.order_details || [];
        const totalAmount = req.body.total_amount || 0;
        const paymentMethod = req.body.payment_method || "";

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
            VALUES ($1, $2, $3, $4, $5)
            `,
            [
                customerId,
                orderId,
                JSON.stringify(orderDetails),
                totalAmount,
                paymentMethod
            ]
        );

        res.json({
            success: true,
            message: "Order saved successfully",
            order_id: orderId
        });

    } catch (error) {

        console.error("Order error:", error);

        res.status(500).json({
            success: false,
            message: "Could not save order"
        });
    }
});

/* =========================
   GET ORDERS
========================= */

app.get("/api/orders", async (req, res) => {
    try {

        if (!pool) {
            return res.status(500).json({
                success: false,
                message: "Database is not connected"
            });
        }

        const result = await pool.query(`
            SELECT *
            FROM orders
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            orders: result.rows
        });

    } catch (error) {

        console.error("Get orders error:", error);

        res.status(500).json({
            success: false,
            message: "Could not get orders"
        });
    }
});

/* =========================
   GET CUSTOMERS
========================= */

app.get("/api/customers", async (req, res) => {
    try {

        if (!pool) {
            return res.status(500).json({
                success: false,
                message: "Database is not connected"
            });
        }

        const result = await pool.query(`
            SELECT *
            FROM customers
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            customers: result.rows
        });

    } catch (error) {

        console.error("Get customers error:", error);

        res.status(500).json({
            success: false,
            message: "Could not get customers"
        });
    }
});

/* =========================
   LIVE SERVER STATISTICS
========================= */

app.get("/api/stats", (req, res) => {

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

    const cpuUsage = ((1 - idle / total) * 100).toFixed(1);

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    let disk = null;

    try {

        const stat = fs.statfsSync("/");

        const totalDisk = stat.blocks * stat.bsize;
        const freeDisk = stat.bfree * stat.bsize;

        disk = {
            total: totalDisk,
            free: freeDisk,
            usedPercent: (
                ((totalDisk - freeDisk) / totalDisk) * 100
            ).toFixed(1)
        };

    } catch (error) {

        disk = {
            usedPercent: "N/A"
        };
    }

    res.json({
        cpu: cpuUsage,
        memory: ((usedMemory / totalMemory) * 100).toFixed(1),
        disk: disk.usedPercent,
        hostname: os.hostname(),
        platform: os.platform(),
        uptime: os.uptime()
    });
});

/* =========================
   DASHBOARD
========================= */

app.get("/dashboard.html", (req, res) => {
    res.sendFile(
        path.join(publicFolder, "dashboard.html")
    );
});

/* =========================
   START SERVER
========================= */

async function startServer() {

    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {

        console.log(
            `The Rustic Brew server running on port ${PORT}`
        );

    });
}

startServer();