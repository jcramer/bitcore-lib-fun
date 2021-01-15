# bitcore-lib-fun

This repo shows how to build fun Bitcoin Cash web apps!

## Browser wallet reactjs + TypeScript project `./web-browser-wallet`

The following steps were taken to create this project:

1. Create a new react project: `$ npx create-react-app my-app --folder-name`
2. Add Typescript libs: `$ npm install --save typescript @types/node @types/react @types/react-dom @types/jest`
3. Rename .js files to .tsx
4. Add Bitcoin Cash libs: `$ npm i --save bitcore-lib-cash @types/bitcore-lib-cash bchaddrjs-slp grpc-bchrpc-web`
5. Other libs: `$ npm i qrcode.react`
