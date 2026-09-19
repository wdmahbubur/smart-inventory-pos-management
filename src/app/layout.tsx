import type { Metadata } from 'next';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';
const inter=Inter({subsets:['latin'],variable:'--font-inter',display:'swap'});
const bengali=Noto_Sans_Bengali({subsets:['bengali'],variable:'--font-bengali',display:'swap'});
export const metadata:Metadata={title:{default:'Smart Inventory — Inventory & POS',template:'%s · Smart Inventory'},description:'Organize products, receive purchases and complete cash sales with traceable inventory.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${inter.variable} ${bengali.variable}`}><a href="#main-content" className="skip-link">Skip to content</a>{children}</body></html>}
