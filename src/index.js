// https://stackoverflow.com/a/50377270/1701465
global.Buffer = global.Buffer || require('buffer').Buffer;

import "@babel/polyfill";

import * as React from "react";
import express from "express";
import {OK} from "http-status-codes";
import appRootPath from "app-root-path";
import {renderToString} from "react-dom/server";
import {compile} from "handlebars";
import {decode as atob} from "base-64";
import axios from "axios";
import https from "https";

import App from "./app/App";

const validate = ({ merchantInfo, https: { ...extras } }) => (req, res, next) => Promise
  .resolve()
  .then(
    () => {
      const {query} = req;
      const {url: validationUrl} = query;
      const url = atob(validationUrl);
      return axios(
        {
          url,
          method: "post",
          data: merchantInfo,
          httpsAgent: new https.Agent({...extras}),
        },
      );
    },
  )
  .then(({data}) => res.status(OK).json(data))
  .catch(next);

const app = ({path, methodData, options, forceApplePayJS}) => (req, res, next) => Promise
  .resolve()
  .then(
    () => {
      const {query} = req;
      const {details, deepLinkUri} = query;
      const host = `https://${req.get("host")}`;
      const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment</title>
    <style>
      body { margin:0; }
    </style>
    <script>
      var global = global || window;
    </script>
    <script type="text/javascript">
      window.__REACT_APP_CONFIG__ = {
        path: "${path}",
        host: "${host}",
        deepLinkUri: ${!!deepLinkUri ? `"${atob(deepLinkUri)}"` : null},
        methodData: ${JSON.stringify(methodData)},
        details: ${atob(details)}, 
        options: ${JSON.stringify(options)},
        forceApplePayJS: ${forceApplePayJS},
      };
    </script>
  </head>
  <body>
    <div id="container"></div>
    <div id="root"></div>
    <script src="${path}/root/app.js" charset="utf-8"></script>
    <script src="${path}/root/vendor.js" charset="utf-8"></script>
    <script src="${path}/app.js" charset="utf-8"></script>
    <script src="${path}/vendor.js" charset="utf-8"></script>
  </body>
</html>
      `.trim();
      return res.status(OK).send(compile(html)({}));
    },
  )
  .catch(next);

const defaultOptions = {
  path: "/payment",
  options: {
    requestShipping: false,
    requestPayerEmail: false,
    requestPayerPhone: false,
  },
  forceApplePayJS: false,
};

export const paymentRequest = (options = defaultOptions) => {
  const {https, merchantInfo, ...opts} = {...defaultOptions, ...options};
  const {path} = opts;
  return express()
    .get(`${path}/app.js`, (_, res) => res.status(OK).sendFile(appRootPath + '/node_modules/express-payment-request/dist/app.js'))
    .get(`${path}/vendor.js`, (_, res) => res.status(OK).sendFile(appRootPath + '/node_modules/express-payment-request/dist/vendor.js'))
    .get(`${path}/validate`, validate({ https, merchantInfo }))
    .get(path, app(opts));
};
