#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DefiPortfolioTrackerStack } from '../lib/defi-portfolio-tracker-stack';

const app = new cdk.App();

new DefiPortfolioTrackerStack(app, 'DefiPortfolioTrackerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Event-driven DeFi Portfolio Tracker - Free Tier friendly',
});

app.synth();
