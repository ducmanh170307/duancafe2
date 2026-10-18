const {query}=require('../config/db');
async function openShift(registerId,conn){return (await query("SELECT * FROM cash_shifts WHERE register_id=? AND status IN ('OPEN','PAUSED','PENDING_APPROVAL') ORDER BY id DESC LIMIT 1 FOR UPDATE",[registerId],conn))[0];}
async function lastShift(registerId,conn){return (await query("SELECT id,kept_cash FROM cash_shifts WHERE register_id=? AND status='CLOSED' ORDER BY id DESC LIMIT 1",[registerId],conn))[0];}
async function cashSummary(id,conn){
 const totals=(await query(`SELECT COALESCE(SUM(CASE WHEN method='CASH' AND direction='CHARGE' THEN amount ELSE 0 END),0) cash_sales,
 COALESCE(SUM(CASE WHEN method='CASH' AND direction='REFUND' THEN amount ELSE 0 END),0) cash_refunds
 FROM payments WHERE cash_shift_id=? AND status='SUCCESS'`,[id],conn))[0];
 const moves=(await query(`SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END),0) cash_in,
 COALESCE(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END),0) cash_out FROM cash_movements WHERE cash_shift_id=?`,[id],conn))[0];
 const stats=(await query(`SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN payment_status='PAID' THEN total ELSE 0 END),0) AS revenue,
 COALESCE(SUM(discount),0) AS discounts,COUNT(CASE WHEN status='CANCELLED' THEN 1 END) AS cancellations
 FROM orders WHERE cash_shift_id=?`,[id],conn))[0];
 const methods=await query(`SELECT method, direction, SUM(amount) AS amount FROM payments WHERE cash_shift_id=? AND status='SUCCESS' GROUP BY method,direction`,[id],conn);
 return {...totals,...moves,...stats,methods};
}
module.exports={openShift,lastShift,cashSummary};
