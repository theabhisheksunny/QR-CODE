import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-center text-2xl font-bold">QR Share — Coming Soon</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
