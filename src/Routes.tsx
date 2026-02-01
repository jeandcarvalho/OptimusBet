// src/Routes.tsx (ou onde você declara o createHashRouter)

import { createHashRouter } from "react-router-dom";

import App from "./App";
import Home from "./Components/Home";
import Fixture from "./Components/Fixture";

export const Routes = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },

      // ✅ NOVA ROTA: página do jogo
      { path: "fixture/:id", element: <Fixture /> },
    ],
  },
]);
