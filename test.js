import axios from "axios"
import agent from "./uSocks-Agent/index.js"

let Agent = new agent("socks5://127.0.0.1")


axios.get('https://www.bloxxy.com',
    {
        httpAgent: Agent,
        httpsAgent: Agent
    }
).then(res => {
    console.log(res.data)
}).catch(err => console.error(err))
