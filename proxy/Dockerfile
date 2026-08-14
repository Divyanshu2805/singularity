FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js auth.js routing.js ./
EXPOSE 80
CMD ["node", "index.js"]