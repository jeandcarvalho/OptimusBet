import { Link } from "react-router-dom";

const Footer: React.FC = () => {
  return (
    <footer className="bg-zinc-900 text-white py-4">
      <div className="container mx-auto text-center">
        {/* Links do site */}
        <nav className="flex flex-wrap justify-center gap-4 mb-2">
          <Link to="/" className="text-zinc-400 hover:text-white">Home</Link>
          <Link to="/Search" className="text-zinc-400 hover:text-white">Acquisitions</Link>
          <Link to="/About" className="text-zinc-400 hover:text-white">About</Link>
        </nav>

        {/* Links de contato */}
        <div className="flex justify-center gap-4 mb-2">
          <a href="https://www.instagram.com/gsa.pg/" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white">
            Instagram
          </a>
          <a href="https://www.linkedin.com/company/gsapg" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white">
            LinkedIn
          </a>
        </div>

        {/* Direitos autorais */}

      </div>
    </footer>
  );
};

export default Footer;
