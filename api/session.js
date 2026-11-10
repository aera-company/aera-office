// Site login (C89): tells the page whether this browser is logged in. Nothing else comes back.
import {loggedIn,loginReady} from './_session.js';

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  return res.status(200).json({logged:loggedIn(req),available:loginReady()});
}
