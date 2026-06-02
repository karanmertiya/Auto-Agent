FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build
RUN npm install -g serve
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:8080"]
