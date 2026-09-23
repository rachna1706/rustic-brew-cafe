const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

const publicFolder = path.join(__dirname, "public");
const ordersFile = path.join(__dirname, "orders.json");
const customersFile = path.join(__dirname, "customers.json");

app.use(express.static(publicFolder));

function readJSON(file) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "[]");
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* CUSTOMER API */
app.post("/api/customer", (req, res) => {
    try {
        const customers = readJSON(customersFile);

        const customer = {
            id: customers.length + 1,
            name: req.body.name || "",
            phone: req.body.phone || "",
            lang: req.body.lang || "en",
            created_at: new Date().toISOString()
        };

        customers.push(customer);
        writeJSON(customersFile, customers);

        res.json({
            success: true,
            customer_id: customer.id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Could not save customer"
        });
    }
});

/* ORDER API */
app.post("/api/order", (req, res) => {
    try {
        const orders = readJSON(ordersFile);

        const order = {
            customer_id: req.body.customer_id || 0,
            order_id: req.body.order_id || "",
            order_details: req.body.order_details || [],
            total_amount: req.body.total_amount || 0,
            payment_method: req.body.payment_method || "",
            created_at: new Date().toISOString()
        };

        orders.push(order);
        writeJSON(ordersFile, orders);

        res.json({
            success: true,
            message: "Order saved successfully",
            order_id: order.order_id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Could not save order"
        });
    }
});

/* LIVE SERVER STATISTICS */
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
            usedPercent: (((totalDisk - freeDisk) / totalDisk) * 100).toFixed(1)
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

/* DASHBOARD */
app.get("/dashboard.html", (req, res) => {
    res.sendFile(path.join(publicFolder, "dashboard.html"));
});

/* START SERVER */
app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Rustic Brew server running on port ${PORT}`);
});