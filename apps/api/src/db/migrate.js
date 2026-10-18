require('../config/env');
const fs=require('node:fs');
const path=require('node:path');
const {pool}=require('../config/db');
const {assertEnv}=require('../config/env');
async function migrate(){
 assertEnv();
 const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
 // Schema khong dung stored procedures, co the tach bang dau ;
 for(const stmt of sql.split(';').map(x=>x.trim()).filter(Boolean)) await pool.query(stmt);
 console.log('Đã cập nhật schema MySQL.');
 await pool.end();
}
migrate().catch(err=>{console.error('Migration thất bại:',err);process.exit(1);});
