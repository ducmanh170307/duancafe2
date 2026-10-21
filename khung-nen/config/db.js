const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: 'CoffeeChainSystem',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

let poolPromise;

const connectDB = async () => {
    try {
        if (!poolPromise) {
            poolPromise = await sql.connect(config);
            console.log('✅ Đã kết nối SQL Server (CoffeeChainSystem) thành công!');
        }
        return poolPromise;
    } catch (err) {
        console.error('❌ Lỗi kết nối Database:', err.message);
        poolPromise = null;
        throw err;
    }
};

module.exports = { sql, connectDB };