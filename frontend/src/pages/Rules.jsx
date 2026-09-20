import { useState, useEffect } from 'react'
import api from '../services/api'
import { MapPin, AlertTriangle, Info } from 'lucide-react'

const COUNTRIES = ['India', 'USA', 'UK', 'Germany', 'Australia', 'Canada', 'France', 'Japan']
const BIN_COLORS = { blue: '🔵', green: '🟢', red: '🔴', yellow: '🟡', grey: '⚫', black: '⚫' }

export default function Rules() {
  const [country, setCountry] = useState('India')
  const [state, setState] = useState('Maharashtra')
  const [city, setCity] = useState('Mumbai')
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [disclaimer, setDisclaimer] = useState('')

  const fetchRules = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ country })
      if (state) params.append('state', state)
      if (city) params.append('city', city)
      const res = await api.get(`/rules?${params}`)
      setRules(res.data.rules)
      setDisclaimer(res.data.disclaimer)
    } catch (err) {
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRules() }, [country, state, city])

  const INDIA_STATES = ["Andhra Pradesh", "Arunachal Pradesh","Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",  "Kerala", "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
  const INDIA_CITIES = {
  "Andhra Pradesh": [
    "Amaravati",
    "Anantapur",
    "Bhimavaram",
    "Chittoor",
    "Eluru",
    "Guntur",
    "Kadapa",
    "Kakinada",
    "Kurnool",
    "Machilipatnam",
    "Nandyal",
    "Narasaraopet",
    "Nellore",
    "Ongole",
    "Rajahmundry",
    "Srikakulam",
    "Tadepalligudem",
    "Tirupati",
    "Vijayawada",
    "Visakhapatnam",
    "Vizianagaram"
  ],

  "Arunachal Pradesh": [
    "Itanagar",
    "Naharlagun",
    "Pasighat",
    "Tawang",
    "Ziro",
    "Bomdila",
    "Tezu",
    "Namsai",
    "Aalo",
    "Daporijo"
  ],

  "Assam": [
    "Guwahati",
    "Dibrugarh",
    "Silchar",
    "Jorhat",
    "Nagaon",
    "Tinsukia",
    "Tezpur",
    "Sivasagar",
    "Dhubri",
    "Diphu",
    "North Lakhimpur",
    "Karimganj",
    "Bongaigaon"
  ],

  "Bihar": [
    "Patna",
    "Gaya",
    "Bhagalpur",
    "Muzaffarpur",
    "Purnia",
    "Darbhanga",
    "Arrah",
    "Begusarai",
    "Katihar",
    "Munger",
    "Chhapra",
    "Bettiah",
    "Saharsa",
    "Hajipur",
    "Dehri"
  ],

  "Chhattisgarh": [
    "Raipur",
    "Bhilai",
    "Bilaspur",
    "Korba",
    "Durg",
    "Rajnandgaon",
    "Jagdalpur",
    "Raigarh",
    "Ambikapur",
    "Dhamtari",
    "Mahasamund"
  ],

  "Goa": [
    "Panaji",
    "Vasco da Gama",
    "Margao",
    "Mapusa",
    "Ponda",
    "Bicholim",
    "Curchorem",
    "Canacona"
  ],

  "Gujarat": [
    "Ahmedabad",
    "Surat",
    "Vadodara",
    "Rajkot",
    "Bhavnagar",
    "Jamnagar",
    "Junagadh",
    "Gandhinagar",
    "Anand",
    "Bharuch",
    "Bhuj",
    "Gandhidham",
    "Navsari",
    "Morbi",
    "Nadiad",
    "Porbandar",
    "Mehsana",
    "Vapi",
    "Valsad",
    "Palanpur"
  ],

  "Haryana": [
    "Gurugram",
    "Faridabad",
    "Panipat",
    "Ambala",
    "Yamunanagar",
    "Rohtak",
    "Hisar",
    "Karnal",
    "Sonipat",
    "Panchkula",
    "Bhiwani",
    "Sirsa",
    "Rewari",
    "Kaithal",
    "Jind"
  ],

  "Himachal Pradesh": [
    "Shimla",
    "Dharamshala",
    "Solan",
    "Mandi",
    "Kullu",
    "Manali",
    "Hamirpur",
    "Bilaspur",
    "Chamba",
    "Nahan",
    "Una",
    "Baddi"
  ],

  "Jharkhand": [
    "Ranchi",
    "Jamshedpur",
    "Dhanbad",
    "Bokaro",
    "Deoghar",
    "Hazaribagh",
    "Giridih",
    "Ramgarh",
    "Phusro",
    "Medininagar",
    "Chaibasa"
  ],

  "Karnataka": [
    "Bengaluru",
    "Mysuru",
    "Hubballi",
    "Dharwad",
    "Mangaluru",
    "Belagavi",
    "Kalaburagi",
    "Davangere",
    "Ballari",
    "Shivamogga",
    "Tumakuru",
    "Raichur",
    "Bidar",
    "Hassan",
    "Mandya",
    "Udupi",
    "Chitradurga",
    "Vijayapura",
    "Kolar",
    "Gadag",
    "Bagalkot",
    "Hospet"
  ],

  "Kerala": [
    "Thiruvananthapuram",
    "Kochi",
    "Kozhikode",
    "Kollam",
    "Thrissur",
    "Kannur",
    "Alappuzha",
    "Palakkad",
    "Kottayam",
    "Malappuram",
    "Kasaragod",
    "Idukki",
    "Pathanamthitta"
  ],

  "Madhya Pradesh": [
    "Bhopal",
    "Indore",
    "Jabalpur",
    "Gwalior",
    "Ujjain",
    "Sagar",
    "Dewas",
    "Satna",
    "Ratlam",
    "Rewa",
    "Murwara",
    "Singrauli",
    "Burhanpur",
    "Khandwa",
    "Chhindwara",
    "Bhind",
    "Shivpuri"
  ],

  "Maharashtra": [
    "Mumbai",
    "Pune",
    "Nagpur",
    "Nashik",
    "Thane",
    "Aurangabad",
    "Navi Mumbai",
    "Solapur",
    "Kolhapur",
    "Amravati",
    "Nanded",
    "Sangli",
    "Jalgaon",
    "Akola",
    "Latur",
    "Dhule",
    "Ahmednagar",
    "Chandrapur",
    "Parbhani",
    "Satara",
    "Ratnagiri"
  ],

  "Manipur": [
    "Imphal",
    "Thoubal",
    "Bishnupur",
    "Churachandpur",
    "Ukhrul",
    "Senapati"
  ],

  "Meghalaya": [
    "Shillong",
    "Tura",
    "Nongpoh",
    "Jowai",
    "Nongstoin",
    "Williamnagar",
    "Baghmara"
  ],

  "Mizoram": [
    "Aizawl",
    "Lunglei",
    "Champhai",
    "Kolasib",
    "Serchhip",
    "Saiha",
    "Lawngtlai"
  ],

  "Nagaland": [
    "Kohima",
    "Dimapur",
    "Mokokchung",
    "Tuensang",
    "Wokha",
    "Mon",
    "Zunheboto",
    "Phek"
  ],

  "Odisha": [
    "Bhubaneswar",
    "Cuttack",
    "Rourkela",
    "Brahmapur",
    "Sambalpur",
    "Puri",
    "Balasore",
    "Baripada",
    "Jharsuguda",
    "Bargarh",
    "Bhadrak",
    "Angul",
    "Dhenkanal",
    "Koraput",
    "Rayagada",
    "Jeypore"
  ],

  "Punjab": [
    "Ludhiana",
    "Amritsar",
    "Jalandhar",
    "Patiala",
    "Bathinda",
    "Mohali",
    "Hoshiarpur",
    "Batala",
    "Pathankot",
    "Moga",
    "Abohar",
    "Firozpur",
    "Kapurthala",
    "Sangrur"
  ],

  "Rajasthan": [
    "Jaipur",
    "Jodhpur",
    "Kota",
    "Bikaner",
    "Ajmer",
    "Udaipur",
    "Bhilwara",
    "Alwar",
    "Bharatpur",
    "Sikar",
    "Sri Ganganagar",
    "Pali",
    "Tonk",
    "Kishangarh",
    "Beawar",
    "Chittorgarh",
    "Barmer",
    "Jaisalmer"
  ],

  "Sikkim": [
    "Gangtok",
    "Namchi",
    "Gyalshing",
    "Mangan",
    "Ravangla",
    "Singtam"
  ],

  "Tamil Nadu": [
    "Chennai",
    "Coimbatore",
    "Madurai",
    "Tiruchirappalli",
    "Salem",
    "Tiruppur",
    "Erode",
    "Vellore",
    "Thoothukudi",
    "Dindigul",
    "Thanjavur",
    "Tirunelveli",
    "Nagercoil",
    "Kanchipuram",
    "Karur",
    "Hosur",
    "Cuddalore",
    "Kumbakonam",
    "Sivakasi",
    "Pudukkottai"
  ],

  "Telangana": [
    "Hyderabad",
    "Warangal",
    "Nizamabad",
    "Karimnagar",
    "Khammam",
    "Ramagundam",
    "Mahbubnagar",
    "Nalgonda",
    "Adilabad",
    "Suryapet",
    "Siddipet",
    "Miryalaguda",
    "Jagtial",
    "Mancherial"
  ],

  "Tripura": [
    "Agartala",
    "Dharmanagar",
    "Udaipur",
    "Kailasahar",
    "Belonia",
    "Khowai",
    "Ambassa"
  ],

  "Uttar Pradesh": [
    "Lucknow",
    "Kanpur",
    "Ghaziabad",
    "Agra",
    "Varanasi",
    "Prayagraj",
    "Meerut",
    "Bareilly",
    "Aligarh",
    "Moradabad",
    "Saharanpur",
    "Gorakhpur",
    "Noida",
    "Firozabad",
    "Jhansi",
    "Mathura",
    "Ayodhya",
    "Muzaffarnagar",
    "Rampur",
    "Shahjahanpur",
    "Farrukhabad",
    "Hapur",
    "Etawah",
    "Mirzapur",
    "Bulandshahr",
    "Sambhal"
  ],

  "Uttarakhand": [
    "Dehradun",
    "Haridwar",
    "Roorkee",
    "Haldwani",
    "Rudrapur",
    "Kashipur",
    "Rishikesh",
    "Nainital",
    "Almora",
    "Pithoragarh",
    "Mussoorie",
    "Srinagar"
  ],

  "West Bengal": [
    "Kolkata",
    "Howrah",
    "Durgapur",
    "Asansol",
    "Siliguri",
    "Bardhaman",
    "Malda",
    "Baharampur",
    "Kharagpur",
    "Haldia",
    "Raiganj",
    "Jalpaiguri",
    "Darjeeling",
    "Krishnanagar",
    "Balurghat"
  ]
};

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recycling Rules by Location</h1>
        <p className="text-gray-600 mt-1">Find out how waste is collected in your area.</p>
      </div>

      {/* Disclaimer banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <strong>Sample Data Disclaimer:</strong> The rules shown are for demonstration only. Always verify with your local municipal authority for official, current guidelines.
        </div>
      </div>

      {/* Location selector */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-eco-600" /> Select Your Location
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Country</label>
            <select className="input text-sm" value={country} onChange={e => { setCountry(e.target.value); setState(''); setCity('') }}>
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">State</label>
            <select className="input text-sm" value={state} onChange={e => { setState(e.target.value); setCity('') }}>
              <option value="">All States</option>
              {country === 'India' && INDIA_STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">City</label>
            <select className="input text-sm" value={city} onChange={e => setCity(e.target.value)}>
              <option value="">All Cities</option>
              {country === 'India' && state && (INDIA_CITIES[state] || []).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">Loading rules...</div>
      )}

      {!loading && rules.length === 0 && (
        <div className="card text-center py-8">
          <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No rules available for this location yet.</p>
          <p className="text-xs text-gray-400 mt-1">Check national guidelines or try another region.</p>
        </div>
      )}

      {!loading && rules.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-800">
            Rules for {country}{state && ` › ${state}`}{city && ` › ${city}`}
            <span className="ml-2 text-xs font-normal text-gray-500">({rules.length} rules)</span>
          </h2>
          {rules.map((rule, i) => (
            <div key={i} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{BIN_COLORS[rule.bin_color] || '⚫'}</span>
                  <span className="font-bold text-gray-900">{rule.bin_label}</span>
                </div>
                <span className="badge bg-eco-100 text-eco-700">{rule.category}</span>
              </div>
              {rule.collection_schedule && (
                <p className="text-sm text-gray-600 mb-1">📅 <strong>Collection:</strong> {rule.collection_schedule}</p>
              )}
              {rule.special_instructions && (
                <p className="text-sm text-gray-700 mb-1">📋 {rule.special_instructions}</p>
              )}
              {rule.accepted_items && rule.accepted_items !== '[]' && (
                <div className="mt-2">
                  <span className="text-xs font-medium text-gray-500">Accepted Items: </span>
                  {JSON.parse(rule.accepted_items || '[]').map((item, j) => (
                    <span key={j} className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">{item}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-amber-600 mt-2">📌 {rule.notes}</p>
            </div>
          ))}
        </div>
      )}

      {/* General guidance section */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3">🌍 General Recycling Principles</h3>
        <div className="space-y-3 text-sm text-gray-700">
          {[
            { icon: '🔵', title: 'Blue/Dry Bin', desc: 'Clean, dry recyclables: paper, cardboard, plastic bottles, metal cans, glass bottles' },
            { icon: '🟢', title: 'Green/Wet Bin', desc: 'Organic waste, food scraps, garden clippings, cooked food' },
            { icon: '🔴', title: 'Red/Hazardous', desc: 'Batteries, chemicals, paint, medicines — never in regular bins' },
            { icon: '🟡', title: 'Yellow/E-waste', desc: 'Electronics, phones, laptops, cables — take to e-waste centres' },
            { icon: '⚫', title: 'Grey/General', desc: 'Non-recyclable items, sanitary waste, contaminated materials' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-lg">{icon}</span>
              <div>
                <span className="font-semibold">{title}: </span>
                <span>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
