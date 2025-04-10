FROM node:alpine

WORKDIR /usr/src/app

COPY ../package*.json ./

RUN npm install

COPY ./index.ts

RUN npm run start:consumer
