FROM node:22.9.0-bullseye-slim
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN npm install
CMD "npm" "install"
CMD "node" "index.js"