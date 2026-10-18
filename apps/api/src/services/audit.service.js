const {query}=require('../config/db');
async function audit(conn,actor,branch,action,type,id,details={}){
 await query('INSERT INTO audit_logs (actor_id,branch_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)',[actor||null,branch||null,action,type,id||null,JSON.stringify(details)],conn);
}
module.exports={audit};
