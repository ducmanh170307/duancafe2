const {assertEnv}=require('./config/env');
const {pool}=require('./config/db');
const app=require('./app');
async function start(){assertEnv();await pool.query('SELECT 1');app.listen(Number(process.env.PORT)||4000,'0.0.0.0',()=>console.log('API chạy tại http://localhost:'+(process.env.PORT||4000)));}
start().catch(e=>{console.error('Không thể khởi động:',e.message);process.exit(1);});
