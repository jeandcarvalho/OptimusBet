// src/Components/Header.tsx
import React from "react";
import Select from "react-select";
import { useNavigate, useLocation } from "react-router-dom";
import carcara from "../Components/img/carcara23.png";
import customStyles from "../Styles/Header.tsx";

const options = [
  { value: "/", label: "Overview" },
  { value: "/fullfiles", label: "Adaptive DAQ" },
  { value: "/About", label: "Architecture" },
];

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // user data
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  const handleChange = (newValue: unknown) => {
    const selectedOption = newValue as { value: string; label: string } | null;
    if (selectedOption) {
      navigate(selectedOption.value);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }
  };

const handleLogout = () => {
  // limpa dados de auth
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  // mantém o usuário na mesma página (path + query)
  const currentPath = location.pathname + location.search;

  // força o React Router a "re-montar" a página já sem token
  navigate(currentPath || "/", { replace: true });
};


  const handleLoginClick = () => {
    // path + query atual, ex: "/acquisition/20240201...?b.period=day..."
    const currentPath = location.pathname + location.search;
    const redirectParam = encodeURIComponent(currentPath || "/");
    navigate(`/auth?redirect=${redirectParam}`);
  };

  const handleAccountClick = () => {
    navigate("/account");
  };

  return (
    <header className="flex flex-col md:flex-row items-center justify-between p-3 bg-black shadow-md">
      {/* Logo */}
      <img
        src={carcara}
        alt="Carcara Logo"
        className="mr-2 mb-2 md:mb-2"
        width="250"
        style={{ height: "40px" }}
      />

      <div className="flex items-center w-full md:w-auto gap-4">
        {/* Navigation Select */}
        <Select
          options={options}
          styles={customStyles}
          placeholder="Overview"
          className="w-full md:w-auto font-bold p-2"
          classNamePrefix="Select"
          isSearchable={false}
          onChange={handleChange}
        />

        {/* AUTH HEADER AREA */}
        {!token ? (
          // Not logged in → LOGIN button
          <button
            onClick={handleLoginClick}
            className="bg-yellow-500 text-black font-bold py-1 px-3 rounded hover:bg-yellow-400 transition"
          >
            Login
          </button>
        ) : (
          // Logged in → username + logout
          <div className="flex items-center gap-3">
            <button
              onClick={handleAccountClick}
              className="text-yellow-300 font-semibold border border-yellow-300/40 px-3 py-1 rounded hover:bg-yellow-300 hover:text-black transition cursor-pointer"
            >
              {user?.name || user?.email}
            </button>

            <button
              onClick={handleLogout}
              className="bg-red-600 text-white font-bold py-1 px-3 rounded hover:bg-red-500 transition"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
