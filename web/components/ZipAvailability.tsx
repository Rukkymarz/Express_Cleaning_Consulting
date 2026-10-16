'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export default function ZipAvailability(){const router=useRouter();const [zip,setZip]=useState('');return <form className="ecc-zip-form" onSubmit={e=>{e.preventDefault();if(/^\d{5}$/.test(zip))router.push(`/book?zip=${zip}`);}}><label htmlFor="availability-zip">Your ZIP code</label><div><input id="availability-zip" name="zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} required value={zip} onChange={e=>setZip(e.target.value.replace(/\D/g,''))} placeholder="Enter ZIP code"/><button className="ecc-button" type="submit">Check availability →</button></div><small>We confirm coverage with you. Entering a ZIP does not guarantee an available crew.</small></form>;}
