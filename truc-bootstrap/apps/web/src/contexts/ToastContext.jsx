import {createContext,useContext,useState,useCallback} from 'react';
import {CheckCircle2,AlertCircle,X} from 'lucide-react';
const C=createContext(null);
export function ToastProvider({children}){
 const [messages,setMessages]=useState([]);
 const notify=useCallback((message,type='success')=>{
  const id=Date.now()+Math.random();setMessages(prev=>[...prev.slice(-3),{id,message,type}]);
  setTimeout(()=>setMessages(prev=>prev.filter(m=>m.id!==id)),4500);
 },[]);
 return <C.Provider value={notify}>{children}<div className="fixed right-5 bottom-5 z-[100] flex flex-col gap-3 w-[min(400px,calc(100vw-40px))]">
  {messages.map(m=><div key={m.id} role="status" className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-2xl border border-stone-100 text-sm"><span className={m.type==='error'?'text-rose-600':'text-emerald-600'}>{m.type==='error'?<AlertCircle size={20}/>:<CheckCircle2 size={20}/>}</span><span className="flex-1 leading-relaxed">{m.message}</span><button onClick={()=>setMessages(prev=>prev.filter(x=>x.id!==m.id))} aria-label="Đóng thông báo"><X size={16}/></button></div>)}
 </div></C.Provider>;
}
export const useNotify=()=>useContext(C);
