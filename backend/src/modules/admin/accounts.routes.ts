import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import * as accounts from '../aws/awsAccounts.service';
import { writeAudit } from './audit';

// 13.3: long-term IAM user keys only.
const keys = {
  accessKeyId: z.string().regex(/^AKIA[0-9A-Z]{16}$/),
  secretAccessKey: z.string().length(40),
};
const plan = z.enum(['legacy_12_month', 'free_plan_credits', 'paid']);
const nickname = z.string().trim().min(1).max(40);

const keysBody = z.object(keys);
const createBody = z.object({ nickname, ...keys, freeTierPlan: plan.optional() });
const patchBody = z.object({ nickname: nickname.optional(), status: z.enum(['working', 'disabled']).optional(), freeTierPlan: plan.optional() });
const idParams = z.object({ id: z.string().uuid() });
const typeParams = z.object({ id: z.string().uuid(), code: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/) });

export const accountsRouter = Router();

accountsRouter.get(
  '/aws-accounts',
  ah(async (_req, res) => {
    res.json(await accounts.listAccounts());
  }),
);

accountsRouter.post(
  '/aws-accounts/test',
  ah(async (req, res) => {
    const body = parse(keysBody, req.body);
    res.json(await accounts.testKeys(body));
  }),
);

accountsRouter.post(
  '/aws-accounts',
  ah(async (req, res) => {
    const body = parse(createBody, req.body);
    const account = await accounts.createAccount(body);
    await writeAudit(req.admin!.id, 'account.create', 'aws_account', account.id, body);
    res.status(201).json(account);
  }),
);

accountsRouter.put(
  '/aws-accounts/:id/keys',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(keysBody, req.body);
    const account = await accounts.updateKeys(id, body);
    await writeAudit(req.admin!.id, 'account.update_keys', 'aws_account', id, body);
    res.json(account);
  }),
);

accountsRouter.post(
  '/aws-accounts/:id/test',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const out = await accounts.testStoredKeys(id);
    await writeAudit(req.admin!.id, 'account.test', 'aws_account', id);
    res.json(out);
  }),
);

accountsRouter.patch(
  '/aws-accounts/:id',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(patchBody, req.body);
    const account = await accounts.patchAccount(id, body);
    await writeAudit(req.admin!.id, 'account.update', 'aws_account', id, body);
    res.json(account);
  }),
);

accountsRouter.delete(
  '/aws-accounts/:id',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const out = await accounts.deleteAccount(id);
    await writeAudit(req.admin!.id, 'account.delete', 'aws_account', id);
    res.json(out);
  }),
);

accountsRouter.get(
  '/aws-accounts/:id/regions',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    res.json(await accounts.accountRegions(id));
  }),
);

accountsRouter.get(
  '/aws-accounts/:id/regions/:code/instance-types',
  ah(async (req, res) => {
    const { id, code } = parse(typeParams, req.params);
    res.json(await accounts.accountInstanceTypes(id, code));
  }),
);
