const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../../../../.env'),quiet:true});
process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_PORT ||= '3307';
process.env.DB_USER ||= process.env.MYSQL_USER;
process.env.DB_PASSWORD ||= process.env.MYSQL_PASSWORD;
process.env.DB_NAME ||= process.env.MYSQL_DATABASE;
const required = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','JWT_SECRET'];
function assertEnv() {
 const missing = required.filter(k=>!process.env[k]);
 if(missing.length) throw new Error('Thiếu biến môi trường: '+missing.join(', '));
 if(process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET cần tối thiểu 32 ký tự');
}
module.exports = {assertEnv};
