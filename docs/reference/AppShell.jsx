import TopNav from './TopNav'

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col overflow-x-hidden">
      <TopNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
