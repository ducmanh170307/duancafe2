require('./env');
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
 host:process.env.DB_HOST || '127.0.0.1',
 port:Number(process.env.DB_PORT || 3307),
 user:process.env.DB_USER || 'coffee_app',
 password:process.env.DB_PASSWORD,
 database:process.env.DB_NAME || 'coffee_chain',
 waitForConnections:true, connectionLimit:10,
 decimalNumbers:true, dateStrings:true, timezone:'+07:00',
 charset:'utf8mb4'
});
async function query(sql, params=[], conn=pool) {const [rows] = await conn.query(sql,params); return rows;}
async function transaction(work) {
 const conn=await pool.getConnection();
 try { await conn.beginTransaction(); const result=await work(conn); await conn.commit(); return result; }
 catch(error){await conn.rollback();throw error;}
 finally {conn.release();}
}
module.exports={pool,query,transaction};
