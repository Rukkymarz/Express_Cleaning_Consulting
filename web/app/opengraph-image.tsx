import { ImageResponse } from 'next/og';
export const alt = 'Express Cleaning Consult — home and business cleaning, junk removal and pressure washing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:80,background:'#EAF5F2',color:'#133B35'}}><div style={{fontSize:30,letterSpacing:3,display:'flex'}}>EXPRESS CLEANING CONSULT</div><div style={{fontSize:72,fontWeight:700,marginTop:35,lineHeight:1.1,display:'flex'}}>A cleaner space starts with a clear quote.</div><div style={{fontSize:28,marginTop:35,display:'flex'}}>Home · Business · Junk removal · Pressure washing</div><div style={{fontSize:26,marginTop:35,display:'flex',color:'#087F70'}}>www.expresscleaningconsult.com</div></div>, size);
}
