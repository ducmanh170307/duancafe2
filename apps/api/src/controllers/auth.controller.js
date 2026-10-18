const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {query,transaction}=require('../config/db');
const {ensure,fail,ok,wrap}=require('../utils/http');
const {listBranches,registers}=require('../models/common.model');
const {branchAccess}=require('../middleware/auth');
exports.login=wrap(async(req,res)=>{
 const email=String(req.body?.email||'').trim().toLowerCase();
 const password=String(req.body?.password||'');
 ensure(email&&password,'Nhập email và mật khẩu');
 const user=(await query('SELECT * FROM users WHERE email=?',[email]))[0];
 if(!user||!user.active||!(await bcrypt.compare(password,user.password_hash)))fail(401,'Email hoặc mật khẩu không chính xác');
 const token=jwt.sign({sub:String(user.id)},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'8h'});
 ok(res,{token,user:{id:user.id,name:user.name,email:user.email,role:user.role,branch_id:user.branch_id}});
});
exports.me=wrap(async(req,res)=>ok(res,{user:req.user}));
exports.branches=wrap(async(req,res)=>ok(res,await listBranches()));
exports.registers=wrap(async(req,res)=>{
 const branchId=Number(req.params.branchId);branchAccess(req,branchId);
 ok(res,await registers(branchId));
});
exports.users=wrap(async(req,res)=>{
 const branchId=req.user.role==='ADMIN'?Number(req.query.branch_id||0):Number(req.user.branch_id);
 if(req.user.role!=='ADMIN'&&req.query.branch_id)branchAccess(req,Number(req.query.branch_id));
 const where=req.user.role==='ADMIN'?'WHERE (?=0 OR branch_id=?)':'WHERE branch_id=?';
 const params=req.user.role==='ADMIN'?[branchId,branchId]:[req.user.branch_id];
 ok(res,await query(`SELECT id,name,email,phone,role,branch_id,active FROM users ${where} ORDER BY name`,params));
});

exports.customerLookup=wrap(async(req,res)=>{
 const phone=String(req.query.phone||'').trim();ensure(phone.length>=9,'Nhập số điện thoại hợp lệ');
 const user=(await query("SELECT u.id,u.name,u.phone,cp.tier,cp.points FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.phone=? AND u.role='CUSTOMER' AND u.active=1",[phone]))[0];
 ok(res,user||null);
});

exports.registerCustomer=wrap(async(req,res)=>{
 const {name,email,phone,password}=req.body;
 ensure(String(name||'').trim().length>=2,'Cần họ tên');
 ensure(/^\S+@\S+\.\S+$/.test(String(email||'')),'Email không hợp lệ');
 ensure(/^0[0-9]{9}$/.test(String(phone||'')),'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');
 ensure(String(password||'').length>=10,'Mật khẩu tối thiểu 10 ký tự');
 const hash=await bcrypt.hash(password,12);
 const result=await transaction(async conn=>{
  const created=await query("INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?, 'CUSTOMER')",[String(name).trim(),String(email).toLowerCase().trim(),phone,hash],conn);
  await query('INSERT INTO customer_profiles(user_id,points,tier) VALUES (?,0,?)',[created.insertId,'BRONZE'],conn);
  return created.insertId;
 });
 const token=jwt.sign({sub:String(result)},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'8h'});
 ok(res,{token,user:{id:result,name,email,phone,role:'CUSTOMER',branch_id:null}},201);
});
exports.customerInfo=wrap(async(req,res)=>{
 const profile=(await query('SELECT u.id,u.name,u.email,u.phone,cp.points,cp.tier FROM users u JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.id=?',[req.user.id]))[0];
 if(!profile)fail(404,'Không tìm thấy hồ sơ khách hàng');ok(res,profile);
});
