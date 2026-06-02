FROM node:22-alpine

WORKDIR /app

COPY package.json package.json
RUN npm install

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "standalone_agent.js"]
