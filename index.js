

const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const mysql = require('mysql2');
const { jsPDF } = require("jspdf");
const { body, validationResult } = require('express-validator');

const app = express();
const port = 3003;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directorios para archivos
const imageFolder = path.join(__dirname, 'archivos');
const pdfFolder = path.join(__dirname, 'archivosgen');
if (!fs.existsSync(imageFolder)) fs.mkdirSync(imageFolder);
if (!fs.existsSync(pdfFolder)) fs.mkdirSync(pdfFolder);

app.use('/archivos', express.static(imageFolder));
app.use('/archivosgen', express.static(pdfFolder));

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imageFolder);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Conexión a la base de datos
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234567',
    database: 'musicadb'
});
db.connect(err => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        process.exit(1);
    }
    console.log('Conexión exitosa a la base de datos');
});

// Rutas
app.post('/albumes/', upload.single('Imagen'), (req, res) => {
    console.log("Datos del formulario (req.body):", req.body);
    console.log("Archivo subido (req.file):", req.file);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error("Errores de validación:", errors.array());
        return res.status(400).json({ errores: errors.array() });
    }

    const { Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora } = req.body;
    const imagePath = req.file ? req.file.filename : null;
    const pdfFilename = `${Titulo.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const pdfPath = path.join(pdfFolder, pdfFilename);

    try {
        const doc = new jsPDF();
        doc.text("Información del Álbum:", 10, 10);
        doc.text(`Título: ${Titulo}`, 10, 20);
        doc.text(`Artista: ${Artista}`, 10, 30);
        doc.text(`Género: ${Genero}`, 10, 40);
        doc.text(`Fecha de Lanzamiento: ${FechaLanzamiento}`, 10, 50);
        doc.text(`Duración Total: ${DuracionTotal} minutos`, 10, 60);
        doc.text(`Productora: ${Productora}`, 10, 70);

        doc.save(pdfPath);

        const query = "INSERT INTO albumes (Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora, Imagen, ImagenPDF) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(query, [Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora, imagePath, pdfFilename], (err, result) => {
            if (err) {
                console.error('Error al guardar en la base de datos:', err);
                return res.status(500).send('Error al guardar en la base de datos');
            }
            res.status(200).send('Álbum creado con éxito');
        });
    } catch (error) {
        console.error('Error al generar el PDF:', error);
        res.status(500).send('Error al generar el PDF');
    }
});

app.get('/albumes', (req, res) => {
    const query = "SELECT AlbumID AS id, Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora, Imagen, ImagenPDF FROM albumes";
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los álbumes:', err);
            return res.status(500).send('Error al obtener los álbumes');
        }
        res.json(results);
    });
});

app.get('/albumes/:id/pdf', (req, res) => {
    const albumId = req.params.id;

    const query = "SELECT * FROM albumes WHERE AlbumID = ?";
    db.query(query, [albumId], (err, results) => {
        if (err) {
            console.error('Error al buscar el álbum:', err);
            return res.status(500).send('Error al buscar el álbum');
        }

        if (results.length === 0) {
            return res.status(404).send('Álbum no encontrado');
        }

        const album = results[0];
        const pdfPath = path.join(pdfFolder, album.ImagenPDF);

        if (!fs.existsSync(pdfPath)) {
            return res.status(404).send('PDF no encontrado');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="album.pdf"');
        res.sendFile(pdfPath);
    });
});

app.delete('/albumes/:id', (req, res) => {
    const albumId = req.params.id;

    const query = 'DELETE FROM albumes WHERE AlbumID = ?';
    db.query(query, [albumId], (err, result) => {
        if (err) {
            console.error('Error al eliminar el álbum:', err);
            return res.status(500).send('Error al eliminar el álbum');
        }

        if (result.affectedRows === 0) {
            return res.status(404).send('Álbum no encontrado');
        }

        res.status(200).send('Álbum eliminado con éxito');
    });
});

app.put('/albumes/:id', (req, res) => {
    const albumId = req.params.id;
    const { Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora } = req.body;

    const query = `
        UPDATE albumes 
        SET Titulo = ?, Artista = ?, Genero = ?, FechaLanzamiento = ?, DuracionTotal = ?, Productora = ?
        WHERE AlbumID = ?
    `;

    db.query(query, [Titulo, Artista, Genero, FechaLanzamiento, DuracionTotal, Productora, albumId], (err, result) => {
        if (err) {
            console.error('Error al modificar el álbum:', err);
            return res.status(500).send('Error al modificar el álbum');
        }

        if (result.affectedRows === 0) {
            return res.status(404).send('Álbum no encontrado');
        }

        res.status(200).send('Álbum modificado con éxito');
    });
});


// Inicio del servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
