This is a project meant to help verify timing of routes when planning for the subway challenge.


## How to use
First, copy `.env.example` to `.env`. Then change variables as needed.

To install packages:
```bash
npm install
```

To set up and gather data:
```bash
npm run setup
```

To run the script:
```bash
npm run start
```

## How to see your route visually
First, generate the geojson:
```bash
npm run generate-geojson
```

Then start the server. Note that the html file you want to be looking at is src/index.html
```bash
npm run start-server
```