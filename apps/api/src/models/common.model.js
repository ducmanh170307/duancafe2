const {query}=require('../config/db');
async function listBranches(){return query('SELECT * FROM branches ORDER BY id');}
async function getBranch(id,conn){return (await query('SELECT * FROM branches WHERE id=?',[id],conn))[0];}
async function getUser(id,conn){return (await query('SELECT id,name,email,role,branch_id,active FROM users WHERE id=?',[id],conn))[0];}
async function registers(branchId){return query('SELECT * FROM registers WHERE branch_id=?',[branchId]);}
module.exports={listBranches,getBranch,getUser,registers};
