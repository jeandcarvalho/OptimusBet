import axios from 'axios'


const api = axios.create({
    baseURL:"https://carcara-web-api.onrender.com"

})

export default api;