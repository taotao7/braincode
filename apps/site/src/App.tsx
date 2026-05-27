import { HashRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Docs } from "./pages/Docs";
import { I18nProvider } from "./i18n";

export default function App() {
  return (
    <I18nProvider>
      <HashRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
        <Footer />
      </HashRouter>
    </I18nProvider>
  );
}
