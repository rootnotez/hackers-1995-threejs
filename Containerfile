FROM node:20-alpine
WORKDIR /app

# Install deps first so this layer caches across source edits.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
