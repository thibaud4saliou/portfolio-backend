import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// --- ROUTES GET (Lire) ---
app.get('/api/projects', async (req, res) => res.json(await prisma.project.findMany({ orderBy: { order: 'asc' } })));
app.get('/api/projects/:id', async (req, res) => res.json(await prisma.project.findUnique({ where: { id: req.params.id } })));
app.get('/api/photos', async (req, res) => res.json(await prisma.photo.findMany({ orderBy: { order: 'asc' } })));
app.get('/api/reviews', async (req, res) => res.json(await prisma.review.findMany({ orderBy: { order: 'asc' } })));
app.get('/api/equipment', async (req, res) => res.json(await prisma.equipment.findMany({ orderBy: { order: 'asc' } })));

// --- ROUTES POST (Créer) ---
app.post('/api/projects', async (req, res) => res.json(await prisma.project.create({ data: req.body })));
app.post('/api/photos', async (req, res) => res.json(await prisma.photo.create({ data: req.body })));
app.post('/api/reviews', async (req, res) => res.json(await prisma.review.create({ data: req.body })));
app.post('/api/equipment', async (req, res) => res.json(await prisma.equipment.create({ data: req.body })));

// --- ROUTES PUT (Modifier) ---
app.put('/api/projects/:id', async (req, res) => res.json(await prisma.project.update({ where: { id: req.params.id }, data: req.body })));
app.put('/api/photos/:id', async (req, res) => res.json(await prisma.photo.update({ where: { id: req.params.id }, data: req.body })));
app.put('/api/reviews/:id', async (req, res) => res.json(await prisma.review.update({ where: { id: req.params.id }, data: req.body })));
app.put('/api/equipment/:id', async (req, res) => res.json(await prisma.equipment.update({ where: { id: req.params.id }, data: req.body })));

// --- ROUTES DELETE (Supprimer) ---
app.delete('/api/projects/:id', async (req, res) => res.json(await prisma.project.delete({ where: { id: req.params.id } })));
app.delete('/api/photos/:id', async (req, res) => res.json(await prisma.photo.delete({ where: { id: req.params.id } })));
app.delete('/api/reviews/:id', async (req, res) => res.json(await prisma.review.delete({ where: { id: req.params.id } })));
app.delete('/api/equipment/:id', async (req, res) => res.json(await prisma.equipment.delete({ where: { id: req.params.id } })));

app.listen(PORT, () => console.log(`🚀 Serveur API connecté sur le port ${PORT}`));
