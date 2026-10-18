import {createContext,useContext,useState,useEffect,useCallback} from 'react';
import {api,setToken,getToken} from '../api/client';
const AuthContext=createContext(null);
export function AuthProvider({children}){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[branches,setBranches]=useState([]),[branchId,setBranchId]=useState(Number(localStorage.getItem('beanflow_branch'))||1);
 const refreshBranches=useCallback(()=>api('/branches').then(setBranches).catch(()=>{}),[]);
 useEffect(()=>{
  refreshBranches();
  const invalidate=()=>{setToken(null);setUser(null);};
  window.addEventListener('beanflow:unauthorized',invalidate);
  if(getToken()){api('/auth/me').then(({user})=>{setUser(user);if(user.branch_id){setBranchId(Number(user.branch_id));}}).catch(invalidate).finally(()=>setReady(true));}
  else setReady(true);
  return ()=>window.removeEventListener('beanflow:unauthorized',invalidate);
 },[refreshBranches]);
 useEffect(()=>{localStorage.setItem('beanflow_branch',String(branchId));},[branchId]);
 const login=async(email,password)=>{const result=await api('/auth/login',{method:'POST',body:{email,password}});setToken(result.token);setUser(result.user);if(result.user.branch_id)setBranchId(Number(result.user.branch_id));return result.user;};
 const registerCustomer=async(form)=>{const result=await api('/auth/customer-register',{method:'POST',body:form});setToken(result.token);setUser(result.user);return result.user;};
 const logout=()=>{setToken(null);setUser(null);};
 return <AuthContext.Provider value={{user,ready,login,logout,registerCustomer,branches,branchId,setBranchId,refreshBranches}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
