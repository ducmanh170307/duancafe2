const jwt=require('jsonwebtoken');
const {query}=require('../config/db');
const {fail,wrap}=require('../utils/http');
const ROLES={ADMIN:'ADMIN',MANAGER:'BRANCH_MANAGER',CASHIER:'CASHIER',BARISTA:'BARISTA',CUSTOMER:'CUSTOMER'};
const authenticate=wrap(async(req,res,next)=>{
 const token=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)fail(401,'Vui lòng đăng nhập');
 let payload;
 try{payload=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});}catch{fail(401,'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');}
 const rows=await query('SELECT id,name,email,role,branch_id,active FROM users WHERE id=?',[payload.sub]);
 if(!rows[0]?.active)fail(401,'Tài khoản không còn hiệu lực');
 req.user=rows[0]; next();
});
const optionalAuth=wrap(async(req,res,next)=>{
 if(!(req.headers.authorization||'').startsWith('Bearer '))return next();
 return authenticate(req,res,next);
});
const allow=(...roles)=>(req,res,next)=>{if(!roles.includes(req.user?.role))fail(403,'Bạn không có quyền thực hiện thao tác này');next();};
function branchAccess(req,branchId){
 if(req.user.role==='ADMIN')return;
 if(Number(req.user.branch_id)!==Number(branchId))fail(403,'Không được thao tác với chi nhánh khác');
}
module.exports={ROLES,authenticate,optionalAuth,allow,branchAccess};
