import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
from pymavlink import mavutil
from sqlalchemy import create_engine, Column, Integer, Float, String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./flight_data.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# define base database model
class FlightDataPoint(Base):
    __tablename__ = "flight_data"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, index=True)
    lat = Column(Float)
    lon = Column(Float)
    alt = Column(Float)
    heading = Column(Float)


Base.metadata.create_all(bind=engine)

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp"
os.makedirs(TEMP_DIR, exist_ok=True)


def parse_tlog(file_path):
    mav = mavutil.mavlink_connection(file_path)
    flight_data = []

    while True:
        msg = mav.recv_match(type="GLOBAL_POSITION_INT", blocking=False)
        if msg is None:
            break
        data_point = {
            "lat": msg.lat / 1e7,
            "lon": msg.lon / 1e7,
            "alt": msg.alt / 1000,
            "heading": msg.hdg / 100  # convert to degrees
        }
        flight_data.append(data_point)
    return flight_data


def save_to_database(flight_data, file_name):
    db = SessionLocal()
    try:
        for point in flight_data:
            db_point = FlightDataPoint(
                file_name=file_name,
                lat=point["lat"],
                lon=point["lon"],
                alt=point["alt"],
                heading=point["heading"]
            )
            db.add(db_point)
            db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        db.close()


@app.post('/upload-tlog/')
async def upload_tlog(file: UploadFile = File(...)):
    if not file.filename.endswith('.tlog'):
        raise HTTPException(status_code=400, detail="File must be a .tlog file")

    file_path = os.path.join(TEMP_DIR, file.filename)

    with open(file_path, 'wb') as buffer:
        buffer.write(await file.read())

    try:
        flight_data = parse_tlog(file_path)
        save_to_database(flight_data, file.filename)

        return {"message": f"Successfully processed {file.filename}", "data_points": len(flight_data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@app.get('/flight-data/')
def get_flight_data(file_name: str = None):
    db = SessionLocal()
    try:
        query = db.query(FlightDataPoint)
        if file_name:
            query = query.filter(FlightDataPoint.file_name == file_name)
        results = query.all()
        return [
            {
                "id": point.id,
                "file_name": point.file_name,
                "lat": point.lat,
                "lon": point.lon,
                "alt": point.alt,
                "heading": point.heading
            } for point in results
        ]
    finally:
        db.close()

