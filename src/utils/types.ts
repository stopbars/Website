export interface Coordinates {
    lat: number;
    lon: number;
  }
  
  export interface StopBar {
    name: string;
    runway?: string;
    points: string[];
    coords: Coordinates;
  }
  
  export interface SubmissionResponse {
    submissions: {
      [airportCode: string]: Array<{
        id: string;
        airportICAO: string;
        xmlData: string;
      }>;
    };
  }