const TOKEN_KEY='beanflow_token';
export const getToken=()=>sessionStorage.getItem(TOKEN_KEY);
export const setToken=(token)=>token?sessionStorage.setItem(TOKEN_KEY,token):sessionStorage.removeItem(TOKEN_KEY);
export async function api(path,options={}){
 const {method='GET',body,headers,...other}=options;
 const res=await fetch('/api'+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(getToken()?{Authorization:`Bearer ${getToken()}`}:{}) ,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),...other});
 let json;try{json=await res.json();}catch{throw new Error('Máy chủ không trả về JSON');}
 if(!res.ok||json.success===false){
  if(res.status===401&&getToken())window.dispatchEvent(new Event('beanflow:unauthorized'));
  throw new Error(json.message||`Lỗi HTTP ${res.status}`);
 }
 return json.data;
}
