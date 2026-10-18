class HttpError extends Error {
 constructor(code,message){super(message);this.status=code;}
}
const fail=(status,message)=>{throw new HttpError(status,message);};
function ensure(condition,message,status=400){if(!condition)fail(status,message);}
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function number(v,label,{min=0,integer=false}={}){
 const n=Number(v);ensure(v!==undefined&&v!==null&&v!==''&&Number.isFinite(n)&&n>=min&&(!integer||Number.isInteger(n)),`${label} không hợp lệ`);return n;
}
const ok=(res,data,status=200)=>res.status(status).json({success:true,data});
module.exports={HttpError,fail,ensure,wrap,number,ok};
