import net from "net"

const SOCKS_VERSION = 5;
const NO_AUTH_METHOD = 0;
const CONNECT_CMD = 1;
const IPV4_TYPE = 1;
const IPV6_TYPE = 4;
const DOMAIN_NAME_TYPE = 3;

const server = net.createServer((client) => {
    client.once('data', (buffer) => {
        const version = buffer[0];
        const authMethod = buffer[1];

        if (version !== SOCKS_VERSION) {
            client.end(Buffer.from([SOCKS_VERSION, NO_AUTH_METHOD]));
            return;
        }

        client.write(Buffer.from([SOCKS_VERSION, NO_AUTH_METHOD]));

        client.once('data', (request) => {
            const cmd = request[1];
            const addressType = request[3]

            if (cmd !== CONNECT_CMD) {
                client.end(Buffer.from([SOCKS_VERSION, 0x07]));
                return;
            }

            let targetHost;
            let targetPort;

            if (addressType === IPV4_TYPE) {
                targetHost = request.slice(4, request.length - 4).toString();
                targetPort = request.readUInt16BE(request.length - 2);
            } else if (addressType === DOMAIN_NAME_TYPE) {
                const domainLength = request[4];
                targetHost = request.slice(5, 5 + domainLength).toString();
                targetPort = request.readUInt16BE(5 + domainLength);
            } else if (addressType === IPV6_TYPE) {
                client.end(Buffer.from([SOCKS_VERSION, 0x08]));
                return;
            } else {
                client.end(Buffer.from([SOCKS_VERSION, 0x08]));
                return;
            }

            console.log(targetPort, targetHost)

            const target = net.createConnection(targetPort, "86.125.137.217", () => {
                const response = Buffer.alloc(request.length);
                request.copy(response);
                
                response[0] = SOCKS_VERSION;
                response[1] = 0x00;
                client.write(response);

                console.log(response)
                client.pipe(target);
                target.pipe(client);
            });

            target.on('error', (error) => {
                console.log(error)
                client.end(Buffer.from([SOCKS_VERSION, 0x05]));
            });

            client.on('error', (error) => {
                target.end();
            });

            client.on('end', () => {
                target.end();
            });
        });
    });

    client.on('error', (error) => {
    });
});

const PORT = 1080;
server.listen(PORT, () => {
    console.log(`SOCKS5 proxy server listening on port ${PORT}`);
});
