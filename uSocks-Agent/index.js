import net from 'net';
import tls from 'tls';
import dns from 'dns';
import { URL } from 'url';
import { Agent } from 'agent-base';

function parseSocksURL(url) {
    let lookup = false;
    let type = 5;
    const host = url.hostname;
    const port = parseInt(url.port, 10) || 1080;

    switch (url.protocol.replace(':', '')) {
        case 'socks4':
            lookup = true;
            type = 4;
            break;
        case 'socks4a':
            type = 4;
            break;
        case 'socks5':
            lookup = true;
            type = 5;
            break;
        case 'socks':
            type = 5;
            break;
        case 'socks5h':
            type = 5;
            break;
        default:
            throw new TypeError(`A "socks" protocol must be specified! Got: ${String(url.protocol)}`);
    }

    const proxy = {
        host,
        port,
        type,
    };

    if (url.username) {
        proxy.userId = url.username
    }

    if (url.password != null) {
        proxy.password = url.password
    }

    return { lookup, proxy };
}

function padIP(ip) {
    const octets = ip.split('.');
    const paddedOctets = octets.map((octet) => {
      return parseInt(octet, 10).toString().padStart(3, '0');
    });

    return paddedOctets.join('.');
  }

export function omit(obj, ...keys) {
    const ret = {};
    for (let key in obj) {
        if (!keys.includes(key)) {
            ret[key] = obj[key];
        }
    }
    return ret;
}

class uSocksProxyAgent extends Agent {
    constructor(uri, opts) {
        super(opts);

        const url = typeof uri === 'string' ? new URL(uri) : uri;
        const { proxy, lookup } = parseSocksURL(url);

        this.shouldLookup = lookup;
        this.proxy = proxy;
        this.timeout = opts?.timeout ?? null;
    }

    async connect(req, opts) {
        const { shouldLookup, proxy, timeout } = this;

        if (!opts.host) {
            throw new Error('No `host` defined!');
        }

        let { host } = opts;
        const { port, lookup: lookupFn = dns.lookup } = opts;

        if (shouldLookup) {
            host = await new Promise((resolve, reject) => {
                lookupFn(host, {}, (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
            });
        }

        const socksOpts = {
            proxy,
            destination: {
                host,
                port: typeof port === 'number' ? port : parseInt(port, 10),
            },
            command: 'connect',
            timeout: timeout ?? undefined,
        };

        const cleanup = (tlsSocket) => {
            req.destroy();
            socket.destroy();
            if (tlsSocket) tlsSocket.destroy();
        };

        console.log(socksOpts)
        const socket = await createSocksProxyConnection(socksOpts);

        if (timeout !== null) {
            socket.setTimeout(timeout);
            socket.on('timeout', () => cleanup());
        }

        if (opts.secureEndpoint) {
            const servername = opts.servername || opts.host;
            const tlsSocket = tls.connect({
                ...omit(opts, 'host', 'path', 'port'),
                socket,
                servername: net.isIP(servername) ? undefined : servername,
            });

            tlsSocket.once('error', (error) => {
                cleanup(tlsSocket);
            });

            return tlsSocket;
        }

        return socket;
    }
}

function createSocksProxyConnection(socksOpts) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(socksOpts.proxy.port, socksOpts.proxy.host, () => {
            const authMethod = (socksOpts.proxy.userId && socksOpts.proxy.password) ? 2 : 0;
            const authBuffer = Buffer.from([socksOpts.proxy.type, authMethod]);

            socket.once('data', (data) => {
                if (data[1] === 0) {
                    const connectBuffer = Buffer.from([
                        5,
                        1,
                        0,
                        1,
                        ...Buffer.from(socksOpts.destination.host),
                        (socksOpts.destination.port >> 8) & 0xff,
                        socksOpts.destination.port & 0xff,
                      ]);

                    socket.once("data", (data) => {
                        if (data[1] == 0x00) {
                            resolve(socket)
                        } else {
                            reject(new Error("unable to connect to the server"))
                        }
                    })

                    socket.write(connectBuffer);
                } else if (data[1] === 2) {
                    const authBuffer = Buffer.from([
                        socksOpts.proxy.userId.length,
                        ...Buffer.from(socksOpts.proxy.userId).values(),
                        socksOpts.proxy.password.length,
                        ...Buffer.from(socksOpts.proxy.password).values(),
                    ]);

                    socket.write(authBuffer);

                    socket.once('data', (authResult) => {
                        if (authResult[1] === 0) {
                            const connectBuffer = Buffer.from([
                                5,
                                1,
                                0,
                                1,
                                ...Buffer.from(socksOpts.destination.host).values(),
                                (socksOpts.destination.port >> 8) & 0xff,
                                socksOpts.destination.port & 0xff,
                            ]);

                            socket.write(connectBuffer);

                            socket.once("data", (data) => {
                                if (data[1] == 0x00) {
                                    resolve(socket)
                                } else {
                                    reject(new Error("unable to connect to the server"))
                                }
                            })
                        } else {
                            reject(new Error('SOCKS authentication failed'));
                        }
                    });
                } else {
                    reject(new Error('Unsupported SOCKS authentication method'));
                }
            });

            socket.write(authBuffer);
        });

        socket.on('error', (error) => {
            reject(error);
        });

        socket.on('connect', () => {

        });
    });
}

export { uSocksProxyAgent }
export default uSocksProxyAgent