import {useState,useEffect,useCallback} from 'react';
import {api} from '../api/client';
import {useNotify} from '../contexts/ToastContext';
export function useData(path){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null);
 const refresh=useCallback(async()=>{
  if(!path){setLoading(false);return;}
  try{const value=await api(path);setData(value);setError(null);}catch(e){setError(e.message);}finally{setLoading(false);}
 },[path]);
 useEffect(()=>{setLoading(true);refresh();},[refresh]);
 return {data,loading,error,refresh,setData};
}
export function useAction(refresh){
 const notify=useNotify(),[busy,setBusy]=useState(false);
 const run=async(fn,message='Đã cập nhật thành công')=>{
  setBusy(true);try{const result=await fn();if(message)notify(message);if(refresh)await refresh();return result;}catch(e){notify(e.message,'error');return null;}finally{setBusy(false);}
 };
 return {run,busy};
}
