#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { DefiPortfolioTrackerStack } = require('../lib/defi-portfolio-tracker-stack.cjs');

const app = new cdk.App();

new DefiPortfolioTrackerStack(app, 'DefiPortfolioTrackerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Event-driven DeFi Portfolio Tracker - Free Tier friendly',
});

app.synth();
