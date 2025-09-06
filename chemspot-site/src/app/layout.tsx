
export const metadata = { title: 'ChemSpot Tutor', description: 'Chemistry Olympiad spot-test practice' };
export default function RootLayout({ children }: { children: React.ReactNode }){
  return (<html lang="en"><body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased">{children}</body></html>);
}
