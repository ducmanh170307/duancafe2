const jwt=require('jsonwebtoken');
const {query,transaction}=require('../config/db');
const {wrap,ok,ensure,number,fail}=require('../utils/http');
const {sqlNow}=require('../utils/dates');
const {haversineMeters}=require('../utils/rules');
const {branchAccess}=require('../middleware/auth');
const workforce=require('../models/workforce.model');
const {audit}=require('../services/audit.service');
exports.list=wrap(async(req,res)=>{
 const branchId=number(req.query.branch_id||req.user.branch_id||1,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const [shifts,assignments]=await Promise.all([workforce.shifts(branchId),workforce.assignments(branchId)]);
 const requests=await query(`SELECT ar.*,u.name AS employee_name,ws.name AS shift_name FROM attendance_requests ar JOIN users u ON u.id=ar.user_id
 JOIN shift_assignments sa ON sa.id=ar.assignment_id JOIN work_shifts ws ON ws.id=sa.shift_id
 WHERE ws.branch_id=? ORDER BY ar.id DESC LIMIT 50`,[branchId]);
 ok(res,{shifts,assignments,requests});
});
exports.create=wrap(async(req,res)=>{
 const branchId=number(req.body.branch_id||req.user.branch_id,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const {name,job_role,starts_at,ends_at}=req.body;
 ensure(String(name||'').trim().length>0,'Cần tên ca');
 ensure(['CASHIER','BARISTA','SERVICE'].includes(job_role),'Vị trí không hợp lệ');
 ensure(!Number.isNaN(Date.parse(starts_at))&&!Number.isNaN(Date.parse(ends_at))&&new Date(ends_at)>new Date(starts_at),'Thời gian ca không hợp lệ');
 const needed=number(req.body.required_staff,'Số nhân sự',{min:1,integer:true});
 const result=await query('INSERT INTO work_shifts (branch_id,name,job_role,starts_at,ends_at,required_staff,created_by) VALUES (?,?,?,?,?,?,?)',[branchId,name,job_role,starts_at,ends_at,needed,req.user.id]);
 ok(res,{id:result.insertId},201);
});
exports.assign=wrap(async(req,res)=>{
 const shiftId=number(req.params.id,'Mã ca',{min:1,integer:true});const userId=number(req.body.user_id,'Nhân viên',{min:1,integer:true});
 const response=await transaction(async conn=>{
  const shift=(await query('SELECT * FROM work_shifts WHERE id=? FOR UPDATE',[shiftId],conn))[0];if(!shift)fail(404,'Không tìm thấy ca');branchAccess(req,shift.branch_id);
  const user=(await query('SELECT * FROM users WHERE id=?',[userId],conn))[0];ensure(user&&user.active&&Number(user.branch_id)===Number(shift.branch_id),'Nhân viên không thuộc chi nhánh');
  ensure(['ADMIN','BRANCH_MANAGER'].includes(user.role)||user.role===shift.job_role||shift.job_role==='SERVICE','Chức danh không khớp ca');
  const clashes=await query(`SELECT sa.id FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id
   WHERE sa.user_id=? AND sa.status='ASSIGNED' AND ws.starts_at<? AND ws.ends_at>? LIMIT 1`,[userId,shift.ends_at,shift.starts_at],conn);
  ensure(clashes.length===0,'Nhân viên bị trùng lịch');
  const weekly=(await query(`SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE,ws.starts_at,ws.ends_at)),0) AS minutes
   FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id WHERE sa.user_id=? AND sa.status='ASSIGNED'
   AND YEARWEEK(ws.starts_at,3)=YEARWEEK(?,3)`,[userId,shift.starts_at],conn))[0].minutes;
  ensure(weekly+(new Date(shift.ends_at)-new Date(shift.starts_at))/60000<=48*60,'Vượt giới hạn 48 giờ/tuần');
  const capacity=(await query("SELECT COUNT(*) AS n FROM shift_assignments WHERE shift_id=? AND status='ASSIGNED'",[shiftId],conn))[0].n;
  ensure(capacity<shift.required_staff,'Ca đã đủ số người cần');
  const ins=await query('INSERT INTO shift_assignments(shift_id,user_id) VALUES (?,?)',[shiftId,userId],conn);
  await audit(conn,req.user.id,shift.branch_id,'SHIFT_ASSIGN','shift_assignment',ins.insertId,{user_id:userId});
  return ins.insertId;
 });ok(res,{id:response},201);
});
exports.qr=wrap(async(req,res)=>{
 const branchId=number(req.params.branchId,'Chi nhánh',{min:1,integer:true});branchAccess(req,branchId);
 const token=jwt.sign({type:'CHECKIN_QR',branchId},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'2m'});
 ok(res,{token,expires_in_seconds:120});
});
exports.checkIn=wrap(async(req,res)=>{
 const shiftId=number(req.body.shift_id,'Ca làm',{min:1,integer:true});const method=req.body.method;
 ensure(['GPS','QR'].includes(method),'Demo hỗ trợ chấm công GPS hoặc QR; Wi-Fi/vân tay cần tích hợp phần cứng');
 const result=await transaction(async conn=>{
  const item=(await query(`SELECT sa.id,ws.branch_id,ws.starts_at,ws.ends_at,b.latitude,b.longitude
   FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id JOIN branches b ON b.id=ws.branch_id
   WHERE sa.user_id=? AND sa.shift_id=? AND sa.status='ASSIGNED' FOR UPDATE`,[req.user.id,shiftId],conn))[0];
  if(!item)fail(403,'Bạn chưa được phân vào ca này');
  const now=Date.now(),start=new Date(item.starts_at.replace(' ','T')+'+07:00').getTime(),end=new Date(item.ends_at.replace(' ','T')+'+07:00').getTime();
  ensure(now>=start-60*60000&&now<=end,'Chưa tới thời gian chấm công hoặc ca đã kết thúc');
  if(method==='GPS'){
   const lat=Number(req.body.latitude),lng=Number(req.body.longitude);
   ensure(Number.isFinite(lat)&&Number.isFinite(lng)&&item.latitude!==null,'Thiếu GPS hoặc chi nhánh chưa cấu hình tọa độ');
   ensure(haversineMeters(lat,lng,Number(item.latitude),Number(item.longitude))<=250,'Vị trí cách chi nhánh quá 250m');
  } else {
   let payload;
   try{payload=jwt.verify(String(req.body.qr_token||''),process.env.JWT_SECRET,{algorithms:['HS256']});}catch{fail(400,'Mã QR đã hết hạn hoặc không hợp lệ');}
   ensure(payload.type==='CHECKIN_QR'&&Number(payload.branchId)===Number(item.branch_id),'Mã QR không thuộc chi nhánh');
  }
  const exists=await query('SELECT id FROM attendance WHERE assignment_id=?',[item.id],conn);ensure(!exists.length,'Bạn đã check-in ca này');
  const late=Math.max(0,Math.ceil((now-start)/60000));
  await query('INSERT INTO attendance (assignment_id,check_in,method,late_minutes) VALUES (?,NOW(),?,?)',[item.id,method,late],conn);
  return {shift_id:shiftId,late_minutes:late};
 });ok(res,result);
});
exports.checkOut=wrap(async(req,res)=>{
 const shiftId=number(req.body.shift_id,'Ca làm',{min:1,integer:true});
 const output=await transaction(async conn=>{
  const attendance=(await query(`SELECT a.id,a.check_out,ws.ends_at FROM attendance a JOIN shift_assignments sa ON sa.id=a.assignment_id JOIN work_shifts ws ON ws.id=sa.shift_id
   WHERE sa.shift_id=? AND sa.user_id=? FOR UPDATE`,[shiftId,req.user.id],conn))[0];
  if(!attendance)fail(404,'Bạn chưa check-in ca này');ensure(!attendance.check_out,'Đã check-out');
  const early=Math.max(0,Math.ceil((new Date(attendance.ends_at.replace(' ','T')+'+07:00').getTime()-Date.now())/60000));
  await query('UPDATE attendance SET check_out=NOW(),early_minutes=? WHERE id=?',[early,attendance.id],conn);return {early_minutes:early};
 });ok(res,output);
});
exports.myAttendance=wrap(async(req,res)=>{
 ok(res,await query(`SELECT sa.id AS assignment_id,ws.id AS shift_id,ws.name,ws.starts_at,ws.ends_at,ws.branch_id,sa.status,a.check_in,a.check_out,a.late_minutes,a.early_minutes
 FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id LEFT JOIN attendance a ON a.assignment_id=sa.id
 WHERE sa.user_id=? AND ws.starts_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) ORDER BY ws.starts_at DESC LIMIT 40`,[req.user.id]));
});
exports.request=wrap(async(req,res)=>{
 const assignmentId=number(req.body.assignment_id,'Ca đã phân',{min:1,integer:true});
 ensure(['LEAVE','SWAP','CORRECTION'].includes(req.body.type),'Loại yêu cầu không hợp lệ');ensure(String(req.body.detail||'').trim().length>=5,'Vui lòng nêu lý do');
 const assigned=(await query('SELECT id FROM shift_assignments WHERE id=? AND user_id=?',[assignmentId,req.user.id]))[0];if(!assigned)fail(403,'Không được yêu cầu thay đổi ca của người khác');
 const result=await query('INSERT INTO attendance_requests (assignment_id,user_id,type,detail,requested_in,requested_out) VALUES (?,?,?,?,?,?)',[assignmentId,req.user.id,req.body.type,req.body.detail,req.body.requested_in||null,req.body.requested_out||null]);ok(res,{id:result.insertId},201);
});
exports.review=wrap(async(req,res)=>{
 const status=req.body.status;ensure(['APPROVED','REJECTED'].includes(status),'Chọn duyệt hoặc từ chối');
 const result=await transaction(async conn=>{
  const item=(await query(`SELECT ar.*,ws.branch_id FROM attendance_requests ar JOIN shift_assignments sa ON sa.id=ar.assignment_id JOIN work_shifts ws ON ws.id=sa.shift_id WHERE ar.id=? FOR UPDATE`,[req.params.id],conn))[0];if(!item)fail(404,'Không tìm thấy yêu cầu');branchAccess(req,item.branch_id);ensure(item.status==='PENDING','Yêu cầu đã được xử lý');
  if(status==='APPROVED'){
   if(item.type==='LEAVE')await query("UPDATE shift_assignments SET status='LEAVE' WHERE id=?",[item.assignment_id],conn);
   if(item.type==='CORRECTION'){
    ensure(item.requested_in||item.requested_out,'Cần thời gian đề nghị điều chỉnh');
    const rows=await query('SELECT id FROM attendance WHERE assignment_id=?',[item.assignment_id],conn);
    if(rows.length)await query("UPDATE attendance SET check_in=COALESCE(?,check_in),check_out=COALESCE(?,check_out),status='CORRECTED' WHERE assignment_id=?",[item.requested_in,item.requested_out,item.assignment_id],conn);
    else await query("INSERT INTO attendance(assignment_id,check_in,check_out,method,status) VALUES (?,?,?,'MANUAL','CORRECTED')",[item.assignment_id,item.requested_in,item.requested_out],conn);
   }
   if(item.type==='SWAP')fail(400,'Đổi ca cần chỉ định nhân sự nhận thay; phiên bản demo không tự hoán đổi lịch');
  }
  await query('UPDATE attendance_requests SET status=?,reviewed_by=? WHERE id=?',[status,req.user.id,item.id],conn);
  await audit(conn,req.user.id,item.branch_id,'ATTENDANCE_REQUEST_REVIEW','attendance_request',item.id,{status});return {id:item.id,status};
 });ok(res,result);
});
