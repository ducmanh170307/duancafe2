const {query}=require('../config/db');
async function shifts(branchId){
 return query(`SELECT ws.*,u.name AS creator_name,
 (SELECT COUNT(*) FROM shift_assignments sa WHERE sa.shift_id=ws.id AND sa.status='ASSIGNED') AS assigned_count
 FROM work_shifts ws JOIN users u ON u.id=ws.created_by
 WHERE ws.branch_id=? AND ws.starts_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)
 ORDER BY ws.starts_at ASC LIMIT 150`,[branchId]);
}
async function assignments(branchId){
 return query(`SELECT sa.id,sa.shift_id,sa.user_id,sa.status,u.name,u.role,ws.name AS shift_name,ws.starts_at,ws.ends_at,
 a.check_in,a.check_out,a.late_minutes,a.early_minutes,a.method
 FROM shift_assignments sa JOIN work_shifts ws ON ws.id=sa.shift_id JOIN users u ON u.id=sa.user_id
 LEFT JOIN attendance a ON a.assignment_id=sa.id
 WHERE ws.branch_id=? AND ws.starts_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) ORDER BY ws.starts_at`,[branchId]);
}
module.exports={shifts,assignments};
