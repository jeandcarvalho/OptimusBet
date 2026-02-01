// Pages/Home.tsx
import { useEffect } from 'react';
import Header from '../Components/Header';
import Footer from '../Components/Footer';
import { loadHomeCounter } from '../Hooks/CreateCount';


const Home: React.FC = () => {
  
    useEffect(() => {
        const fetchData = async () => {
            await loadHomeCounter();
        };
        fetchData();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-zinc-900">
            <Header />




            <Footer />
        </div>
    );
}

export default Home;
