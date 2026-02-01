// router.tsx
import { createHashRouter } from "react-router-dom";
import Home from "./Components/Home";
import App from "./App";



export const Routes = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
  


    ],
  },
]);
