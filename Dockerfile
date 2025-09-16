FROM node:22-alpine
# Update all packages and install security updates
RUN apk update && apk upgrade --no-cache

WORKDIR /usr/src/app
COPY . /usr/src/app

RUN npm install

CMD ["node", "index.js"]
