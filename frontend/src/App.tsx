import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import CardDetail from "./pages/CardDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/cards/:cardId" element={<CardDetail />} />
    </Routes>
  );
}
